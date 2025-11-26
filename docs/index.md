# Tilemap Renderer

**Tilemap Renderer** is a high-performance, modular, and easy-to-use 2D rendering library for JavaScript.  
It supports **WebGL**, **WebGL2**, and **WebGPU**, offering one of the fastest and most flexible sprite rendering pipelines available for modern web applications.

---

## Overview

A **Scene** is composed of multiple **layers**, which provide intuitive z-ordering.  
Each layer can also define its own internal object order, making the system ideal for **top-down** or **isometric** games where depth sorting is essential.

To render a scene, simply create a **Camera** and a **Renderer**.  
The renderer can target any of the supported backend types—WebGL, WebGL2, or WebGPU—without changing your scene or game logic.

---

## Key Features

### Modular Shader System
The library is built around a highly modular architecture that allows you to create **custom shaders** regardless of the rendering backend.  
This includes full support for **post-processing pipelines**, enabling advanced visual effects with minimal setup.

### Dynamic Lighting
Tilemap Renderer includes a built-in **dynamic lighting system** powered by its post-processing framework.  
Just define lights in your scene and they will automatically contribute to the final rendered image.

### Shadow Mapping With Colliders
You can assign **colliders** to objects in your scene to enable automatic **shadow map generation**.  
This makes it easy to create immersive environments with accurate real-time shadows, even in complex tile-based worlds.

---

## Get Started
Use the navigation on the left to explore the documentation, learn the API, and see how to integrate Tilemap Renderer into your project.
