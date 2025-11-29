import { defineConfig } from 'vitepress'

export default defineConfig({
    title: 'Tilemap Renderer',
    description: '2D Tilemap Renderer with WebGL/WebGPU support',

    base: '/tilemap-renderer/',

    themeConfig: {
        nav: [
            { text: 'Guide', link: '/' }
        ],
        sidebar: [
            {
                text: 'Getting Started',
                collapsible: true,
                items: [
                    { text: 'Setup', link: '/setup' }
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
                    { text: 'Tile Animations', link: '/tile-animations' },
                    { text: 'Tilemaps', link: '/tilemaps' }
                ]
            },
            {
                text: 'Advanced Effects',
                collapsible: true,
                items: [
                    { text: 'Lighting', link: '/lighting' },
                    { text: 'Scene Post Processing', link: '/scene-post-processing' }
                ]
            }
        ]
    }
})
