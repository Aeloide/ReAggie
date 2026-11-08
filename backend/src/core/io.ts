import fs from "fs";
import { readFile, stat, unlink, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

export interface IFileSystem {
    exists(path: string): Promise<boolean>;
    existsSync(path: string): boolean;
    readFile(path: string): Promise<Buffer>;
    writeFile(path: string, data: string | Buffer): Promise<void>;
    unlink(path: string): Promise<void>;
    unlinkSync(path: string): void;
    stat(path: string): Promise<{ mtimeMs: number }>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
    mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
}

export class NodeFileSystem implements IFileSystem {
    async exists(path: string): Promise<boolean> {
        return new Promise(r => fs.access(path, fs.constants.F_OK, e => r(!e)));
    }

    existsSync(path: string): boolean {
        return existsSync(path);
    }

    async readFile(path: string): Promise<Buffer> {
        return readFile(path);
    }

    async writeFile(path: string, data: string | Buffer): Promise<void> {
        return writeFile(path, data as any);
    }

    async unlink(path: string): Promise<void> {
        return unlink(path);
    }

    unlinkSync(path: string): void {
        fs.unlinkSync(path);
    }

    async stat(path: string): Promise<{ mtimeMs: number }> {
        return stat(path);
    }

    async mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined> {
        return mkdir(path, options);
    }

    mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined {
        return fs.mkdirSync(path, options);
    }
}

export let fileSystem: IFileSystem = new NodeFileSystem();

export const setFileSystem = (fs: IFileSystem) => {
    fileSystem = fs;
}
