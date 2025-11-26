import { defineConfig } from 'vitepress'

export default defineConfig({
    title: 'Tilemap Renderer',
    description: '2D Tilemap Renderer with WebGL/WebGPU support',

    // Important for GitHub Pages deployment under a subpath
    base: '/Tilemap-Renderer/',

    themeConfig: {
        nav: [
            { text: 'Guide', link: '/' }
        ],
        sidebar: [
            {
                text: 'Getting Started',
                collapsible: true,
                items: [
                    { text: 'Quick Start', link: '/quick-start' }
                ]
            },
            {
                text: 'Rendering Basics',
                collapsible: true,
                items: [
                    { text: 'Sprite Rendering', link: '/sprite-rendering' },
                    { text: 'Vectors', link: '/vectors' },
                    { text: 'Camera', link: '/camera' }
                ]
            },
            {
                text: 'Tilemap System',
                collapsible: true,
                items: [
                    { text: 'Tilesets', link: '/tilesets' },
                    { text: 'Tilemaps', link: '/tilemaps' }
                ]
            },
            {
                text: 'Advanced Effects',
                collapsible: true,
                items: [
                    { text: 'Scene Post Processing', link: '/scene-post-processing' },
                    { text: 'Lighting', link: '/lighting' }
                ]
            }
        ]
    }
})
