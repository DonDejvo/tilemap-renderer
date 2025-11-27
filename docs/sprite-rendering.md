# Sprite Rendering

Rendering sprites involves drawing a texture—or a region of a texture—at a specific position on the screen. Because sprites depend on image data, a texture must be created before any rendering can take place.

## Texture Sources

A *texture source* can be:

- an external image file  
- another canvas  
- a raw buffer  

Most games load external images, so the library provides convenient image-loading utilities that handle asynchronous loading and texture creation.

## Creating a Tileset

The renderer accepts a map of texture names to texture sources and produces a *tileset*.  
A tileset is a definition of the underlying texture along with the data required to work with it.

Tilesets are explained in more detail later, but for now it is enough to know that they are used to create sprites.

## Static vs Dynamic Sprites

Sprites can be either **static** or **dynamic**:

- **Static sprites** are loaded and prepared once. They are ideal for objects that do not require frequent movement, scaling, or changes in appearance.  
- **Dynamic sprites** are designed for elements that move, transform, or update frequently during rendering.

Choosing between static and dynamic sprites can have performance implications, especially in scenes with many moving elements.

## Z-Index and Drawing Order

Each sprite has a **z-index**, which determines its drawing order.  
Sprites with a higher z-index are rendered after those with lower values, meaning they appear on top. This controls layering, foreground placement, and overall visual hierarchy in the scene.

You can see a working live demo below. The demo renders a single sprite:

<iframe src="demos/sprite.html" width="300" height="150" style="border:1px solid #ddd;"></iframe>

<a href="demos/sprite.html" target="_blank">click here to open in separate window</a>