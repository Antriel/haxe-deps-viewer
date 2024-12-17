import * as esbuild from 'esbuild';
import pckg from './package.json' with {type: 'json'};
import { execSync } from 'child_process';

/**
 * Plugin to inject build metadata.
 * @returns {esbuild.Plugin}
 */
function buildMetadataPlugin() {
    return {
        name: 'build-metadata',
        setup(build) {
            let buildDate = new Date().toISOString();
            buildDate = buildDate.substring(0, buildDate.indexOf('T'));
            let gitHash = 'unknown';
            try {
                gitHash = execSync('git rev-parse --short HEAD').toString().trim();
            } catch (error) {
                console.warn('Could not retrieve git hash:', error.message);
            }

            const buildMetadata = {
                buildDate, gitHash, version: pckg.version,
            };

            // Define a namespace for replacing metadata.
            build.onResolve({ filter: /BUILD_METADATA/ }, args => ({
                path: args.path,
                namespace: 'build-metadata'
            }));

            // Provide the actual metadata content.
            build.onLoad({ filter: /.*/, namespace: 'build-metadata' }, () => ({
                contents: JSON.stringify(buildMetadata),
                loader: 'json'
            }));
        }
    };
}

const isBuild = process.argv[2] === 'build';

const ctx = await esbuild.context({
    entryPoints: ['src/index.mjs'],
    bundle: true,
    outfile: 'public/bundle.js',
    plugins: [buildMetadataPlugin()],
    write: isBuild,
    minify: isBuild,
});
if (!isBuild) {
    ctx.serve({ port: 5000, servedir: 'public/' });
} else {
    await ctx.rebuild();
    await ctx.dispose();
}
