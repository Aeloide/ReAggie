import { assetc, ASSET_LOCAL, ASSET_REMOTE, mongoinit, mongoreset } from "./db.js";
import { unlink } from "fs/promises";
import { spawn } from "child_process";
import { snooze } from "./utils.js";
import express from "express";
import { ensureAsset, ensureBackup, HAS_S3 } from "./AssetManager.js"; // Import ensureBackup
import dotenv from "dotenv";
import path from "path";
dotenv.config();

const ASSETS_PATH = "./assets";
// const MOUNT_PATH = ... Removed
const TARGET_FREE_SPACE_GB = 5;
const TARGET_FREE_BYTES = TARGET_FREE_SPACE_GB * 1024 * 1024 * 1024;
const PORT = process.env.ASSET_WORKER_PORT || 9000;

const app = express();

const getFreeSpace = async (): Promise<number> => {
    return new Promise((resolve) => {
        const df = spawn('df', ['-B1', ASSETS_PATH]);
        let out = '';
        df.stdout.on('data', d => out += d.toString());
        df.on('error', error => {
            console.error("Failed to inspect asset disk space", error);
            resolve(Number.MAX_SAFE_INTEGER);
        });
        df.on('close', () => {
            // Filesystem     1B-blocks      Used Available Use% Mounted on
            // ...            ...            ...  12345678 ...  ...
            const lines = out.trim().split('\n');
            if (lines.length < 2) return resolve(0);
            const parts = lines[1].split(/\s+/);
            const avail = parseInt(parts[3], 10);
            resolve(isNaN(avail) ? 0 : avail);
        });
    });
};

// ensureBackup logic moved to AssetManager

const pruneLoop = async () => {
    while (true) {
        try {
            const free = await getFreeSpace();
            // console.log(`Free space: ${(free / 1024 / 1024 / 1024).toFixed(2)} GB`);

            if (free < TARGET_FREE_BYTES) {
                console.log("Low disk space, pruning cache...");

                // Find candidates: present locally, sorted by oldest access
                // We limit to 100 at a time to avoid holding too many resources
                const candidates = await assetc.find(
                    { flags: { $bitsAllSet: ASSET_LOCAL } }
                ).sort({ last_access: 1 }).limit(100).toArray();

                for (const file of candidates) {
                    if (await getFreeSpace() >= TARGET_FREE_BYTES) break;

                    if (HAS_S3) {
                        // Ensure it is backed up (REMOTE flag set)
                        if (!(file.flags & ASSET_REMOTE)) {
                            const backedUp = await ensureBackup(file.filename);
                            if (!backedUp) {
                                console.warn(`Skipping deletion of ${file.filename} because backup failed`);
                                continue;
                            }
                        }

                        // Proceed to delete local
                        try {
                            await unlink(`${ASSETS_PATH}/${file.filename}`);
                            // Update flags: Remove LOCAL
                            await assetc.updateOne(
                                { _id: file._id },
                                { $bit: { flags: { xor: ASSET_LOCAL } } } // XOR with LOCAL to unset it
                            );
                            console.log(`Pruned ${file.filename}`);
                        } catch (e) {
                            console.error(`Failed to delete ${file.filename}`, e);
                            // If file not found locally, just update DB
                            if ((e as any).code === 'ENOENT') {
                                await assetc.updateOne(
                                    { _id: file._id },
                                    { $bit: { flags: { xor: ASSET_LOCAL } } }
                                );
                            }
                        }
                    } else {
                        // S3 Not Available: Permanent Deletion
                        try {
                            await unlink(`${ASSETS_PATH}/${file.filename}`);
                            // Update flags: Set to 0 (Not LOCAL, Not REMOTE)
                            await assetc.updateOne(
                                { _id: file._id },
                                { $set: { flags: 0 } }
                            );
                            console.log(`Permanently pruned ${file.filename} (No S3)`);
                        } catch (e) {
                            console.error(`Failed to delete ${file.filename}`, e);
                            if ((e as any).code === 'ENOENT') {
                                await assetc.updateOne(
                                    { _id: file._id },
                                    { $set: { flags: 0 } }
                                );
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Prune loop error", e);
        }

        await snooze(60 * 1000); // Check every minute
    }
};

// API Endpoint for Asset Fetch
app.get('/assets/pictures/*', async (req, res) => {
    try {
        const prefix = '/assets/pictures/';
        const rawPath = req.path.slice(prefix.length);
        const relPath = decodeURIComponent(rawPath);
        const assetsRoot = path.resolve(ASSETS_PATH);
        const filePath = path.resolve(assetsRoot, relPath);
        if (!filePath.startsWith(assetsRoot + path.sep)) {
            res.status(403).send('Forbidden');
            return;
        }
        const exists = await ensureAsset(relPath, true);
        if (exists) {
            res.setHeader("X-Accel-Redirect", "/internal-assets/pictures/" + relPath);
            res.end();
        } else {
            res.status(404).send('Not Found');
        }
    } catch (e) {
        console.error("Asset fetch error", e);
        res.status(500).send("Error");
    }
});

// Main entry point
export const initAssetWorker = async () => {
    await mongoinit();
    console.log("AssetWorker started");
    app.listen(PORT, () => {
        console.log(`AssetWorker listening on port ${PORT}`);
    });
    pruneLoop();
}

initAssetWorker();