import { createWriteStream, createReadStream } from "fs";
import { stat, utimes, writeFile, mkdir, rename, unlink } from "fs/promises";
import { dirname } from "path";
import { assetc, ASSET_LOCAL, ASSET_REMOTE } from "./db.js";
import { nonRetardedAsyncExists } from "./utils.js";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import dotenv from "dotenv";
dotenv.config();

const ASSETS_PATH = "./assets";
const BUCKET = process.env.S3_BUCKET || "reaggie-assets";

export const HAS_S3 = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

// Helper to allow testing without failing on missing creds immediately if not used
const createS3Client = () => {
    return new S3Client({
        region: process.env.S3_REGION || "us-east-1",
        endpoint: process.env.S3_ENDPOINT,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ""
        },
        forcePathStyle: true // Often needed for compatible APIs like MinIO/Hetzner
    });
};

// Lazy init or just init? Init.
const s3 = HAS_S3 ? createS3Client() : null;

/**
 * Deletes an asset from S3 (if applicable) and the database.
 * Does not delete from local filesystem (managed by caller or separate logic).
 */
export const deleteAsset = async (filename: string) => {
    if (!filename) return;
    try {
        const asset = await assetc.findOne({ filename });
        if (asset) {
            if ((asset.flags & ASSET_REMOTE) && HAS_S3 && s3) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: BUCKET,
                        Key: filename
                    }));
                } catch (e) {
                    console.error(`Failed to delete ${filename} from S3`, e);
                }
            }
            await assetc.deleteOne({ _id: asset._id });
        } else if (HAS_S3 && s3) {
            // Failsafe: try to delete even if not in DB, just in case
            try {
                await s3.send(new DeleteObjectCommand({
                    Bucket: BUCKET,
                    Key: filename
                }));
            } catch (e) {
                console.error(`Failed to delete ${filename} from S3 (failsafe)`, e);
            }
        }
    } catch (e) {
        console.error(`Error in deleteAsset for ${filename}`, e);
    }
};

/**
 * Ensures the asset is available locally in ./assets
 * Updates the last_access timestamp in DB.
 * If missing locally, fetches from S3 (if configured).
 */
export const ensureAsset = async (relPath: string, sync: boolean = false): Promise<boolean> => {
    if (relPath.includes('../')) return false;

    const localPath = `${ASSETS_PATH}/${relPath}`;

    // 1. Check DB state
    const asset = await assetc.findOne({ filename: relPath });
    const isRemote = !!(asset && (asset.flags & ASSET_REMOTE));
    const shouldCheckRemote = HAS_S3 && s3 && (isRemote || sync);

    // 2. Check local existence
    if (await nonRetardedAsyncExists(localPath)) {
        let size = 0;
        try {
            size = (await stat(localPath)).size;
            const now = new Date();
            await utimes(localPath, now, now);
        } catch { /* ignore */ }

        await assetc.updateOne(
            { filename: relPath },
            {
                $set: { last_access: new Date(), size },
                $bit: { flags: { or: ASSET_LOCAL } }
            },
            { upsert: true }
        );
        return true;
    }

    // 3. Not local, fetch from S3 if available/requested
    if (!shouldCheckRemote) {
        return false;
    }

    try {
        await mkdir(dirname(localPath), { recursive: true });
        const temporaryPath = `${localPath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;

        try {
            const command = new GetObjectCommand({
                Bucket: BUCKET,
                Key: relPath
            });
            const response = await s3!.send(command);

            if (!response.Body) throw new Error("No body in S3 response");

            await pipeline(
                response.Body as Readable,
                createWriteStream(temporaryPath, { flags: "wx" })
            );
            await rename(temporaryPath, localPath);
        } catch (error) {
            await unlink(temporaryPath).catch(() => {});
            throw error;
        }

        // Get size
        const stats = await stat(localPath);

        await assetc.updateOne(
            { filename: relPath },
            {
                $set: { size: stats.size, last_access: new Date() },
                $bit: { flags: { or: ASSET_LOCAL | ASSET_REMOTE } }
            },
            { upsert: true }
        );
        return true;

    } catch (e) {
        console.error(`Failed to fetch asset from S3: ${relPath}`, e);
        // Clean up partial file if needed?
        return false;
    }
};

/**
 * Saves a file to local cache and uploads to S3 if configured.
 */
export const saveAsset = async (relPath: string, data: Buffer) => {
    if (relPath.includes('../')) throw new Error("Invalid path");

    const localPath = `${ASSETS_PATH}/${relPath}`;

    await mkdir(dirname(localPath), { recursive: true });
    const temporaryPath = `${localPath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    try {
        await writeFile(temporaryPath, data, { flag: "wx" });
        await rename(temporaryPath, localPath);
    } catch (error) {
        await unlink(temporaryPath).catch(() => {});
        throw error;
    }

    // no need to block on S3 upload because we know we have the file locally

    if (HAS_S3 && s3) {
        const command = new PutObjectCommand({
            Bucket: BUCKET,
            Key: relPath,
            Body: data as any
        });
        s3.send(command).then(() =>
            assetc.updateOne(
                { filename: relPath },
                {
                    $set: {
                        last_access: new Date(),
                        size: data.length
                    },
                    $bit: { flags: { or: ASSET_LOCAL | ASSET_REMOTE } }
                },
                { upsert: true })
        ).catch((e) => {
            console.error(`Failed to upload asset to S3: ${relPath}`, e);
            // Mark as LOCAL only
            void assetc.updateOne(
                { filename: relPath },
                {
                    $set: {
                        last_access: new Date(),
                        size: data.length
                    },
                    $bit: { flags: { or: ASSET_LOCAL } }
                },
                { upsert: true }
            ).catch(error => console.error("Failed to update local asset metadata", error));
        });
    } else {
        // Local only
        void assetc.updateOne(
            { filename: relPath },
            {
                $set: {
                    last_access: new Date(),
                    size: data.length
                },
                $bit: { flags: { or: ASSET_LOCAL } }
            },
            { upsert: true }
        ).catch(error => console.error("Failed to update local asset metadata", error));
    }

    return relPath;
};

/**
 * Ensures a file is backed up to S3.
 * Used by Pruner.
 */
export const ensureBackup = async (filename: string): Promise<boolean> => {
    if (!HAS_S3 || !s3) return false;

    const localPath = `${ASSETS_PATH}/${filename}`;

    try {
        // Check if file exists locally
        if (!await nonRetardedAsyncExists(localPath)) return false;

        // Optimistic check: HeadObject to see if it exists remotely
        // Actually, we can just PutObject (overwrite is fine, ensures consistency)
        // But to save bandwidth, we could HeadObject.
        // The previous logic relied on flags.
        // Let's rely on HeadObject to be sure, or just trust the put.
        // Let's do HeadObject.
        try {
            await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: filename }));
            // It exists
            await assetc.updateOne(
                { filename },
                { $bit: { flags: { or: ASSET_REMOTE } } }
            );
            return true;
        } catch (e: any) {
            if (e.name !== 'NotFound' && e.$metadata?.httpStatusCode !== 404) {
                throw e; // RETHROW errors that aren't "Not Found"
            }
            // Not found, proceed to upload
        }

        const stream = createReadStream(localPath);
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: filename,
            Body: stream
        }));

        await assetc.updateOne(
            { filename },
            { $bit: { flags: { or: ASSET_REMOTE } } }
        );
        return true;

    } catch (e) {
        console.error(`Failed to backup ${filename}`, e);
        return false;
    }
};
