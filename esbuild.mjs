import * as esbuild from 'esbuild';
import pckg from './package.json' with {type: 'json'};
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

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

/**
 * Simple markdown to HTML converter
 * @param {string} markdown 
 * @returns {string}
 */
function markdownToHtml(markdown) {
    let html = markdown
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold and italic
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        // Code blocks and inline code
        .replace(/`([^`]+)`/gim, '<code>$1</code>')
        // Lists
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        .replace(/^(\d+)\. (.*$)/gim, '<li>$2</li>')
        // Line breaks and paragraphs
        .replace(/\n\n/gim, '</p><p>')
        // Horizontal rules
        .replace(/^---$/gim, '<hr>');

    // Wrap consecutive <li> elements in <ul>
    html = html.replace(/(<li>.*<\/li>(?:\s*<li>.*<\/li>)*)/gims, '<ul>$1</ul>');

    // Wrap in paragraphs
    html = '<p>' + html + '</p>';

    // Clean up empty paragraphs and fix multiple paragraph tags
    html = html
        .replace(/<p><\/p>/gim, '')
        .replace(/<p>(<h[1-6]>)/gim, '$1')
        .replace(/(<\/h[1-6]>)<\/p>/gim, '$1')
        .replace(/<p>(<hr>)<\/p>/gim, '$1')
        .replace(/<p>(<ul>)/gim, '$1')
        .replace(/(<\/ul>)<\/p>/gim, '$1');

    return html;
}

/**
 * Plugin to inject documentation HTML.
 * @returns {esbuild.Plugin}
 */
function documentationPlugin() {
    return {
        name: 'documentation',
        setup(build) {
            // Define a namespace for replacing documentation.
            build.onResolve({ filter: /DOCUMENTATION_HTML/ }, args => ({
                path: args.path,
                namespace: 'documentation-html'
            }));

            // Provide the actual documentation content.
            build.onLoad({ filter: /.*/, namespace: 'documentation-html' }, () => {
                try {
                    const markdownPath = join(process.cwd(), 'src', 'documentation.md');
                    const markdownContent = readFileSync(markdownPath, 'utf-8');
                    const htmlContent = markdownToHtml(markdownContent);

                    return {
                        contents: JSON.stringify({ html: htmlContent }),
                        loader: 'json'
                    };
                } catch (error) {
                    console.warn('Could not load documentation:', error.message);
                    return {
                        contents: JSON.stringify({ html: '<p>Documentation not available</p>' }),
                        loader: 'json'
                    };
                }
            });
        }
    };
}

const isBuild = process.argv[2] === 'build';

const ctx = await esbuild.context({
    entryPoints: ['src/index.mjs'],
    bundle: true,
    outfile: 'public/bundle.js',
    plugins: [buildMetadataPlugin(), documentationPlugin()],
    write: isBuild,
    minify: isBuild,
});
if (!isBuild) {
    ctx.serve({ port: 5000, servedir: 'public/' });
} else {
    await ctx.rebuild();
    await ctx.dispose();
}
