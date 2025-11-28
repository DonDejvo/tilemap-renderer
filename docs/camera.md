# Camera

The Camera defines the visible region of the scene and controls how the world is projected onto the screen. It does not render anything itself — instead, it provides the viewport through which the scene is viewed.

**Scene coordinate system:**  
The origin `(0,0)` is at the **top-left** corner.  
- **x** increases to the **right**  
- **y** increases **downward**

---

## Attributes

### **vw**  
Width of the camera's viewport in world units.  
This determines how much horizontal space is visible at once.

### **vh**  
Height of the camera's viewport in world units.  
Together with `vw`, it defines the camera’s visible area.

### **position**  
A `Vector` representing the camera’s center point in the world.  
Updating this value moves the visible region across the scene.

---

## Behavior

- Changing `vw` or `vh` adjusts the zoom level by expanding or shrinking the viewport.
- Modifying `position` moves the camera smoothly across the world.
- The camera affects only what is rendered, not gameplay logic.

