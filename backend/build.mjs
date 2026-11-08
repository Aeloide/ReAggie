import esbuild from "esbuild";
import cp from "child_process";
import os from "os";

const getGitHeadCommitHash = () => {
    try {
        const devNull = os.platform() === 'win32' ? 'nul' : '/dev/null';
        return cp.execSync(`git rev-parse HEAD 2>${devNull}`).toString().trim();
    } catch (e) {
        return "no-git-repo";
    }
};

const minify = !process.argv.includes('dev');
const ctx = await esbuild.context({
    entryPoints: ['./src/**/*.ts'],
    outdir: './dist',
    bundle: false,
    minify: minify,
    color: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'debug',
    define: {
        hash: JSON.stringify(getGitHeadCommitHash())
    }
});

if (process.argv.includes('watch')) {
    await ctx.watch();
} else {
    await ctx.rebuild();
    await ctx.dispose();
}
