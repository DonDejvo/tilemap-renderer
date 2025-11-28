# Vectors

The `Vector` class provides a lightweight and efficient 2D vector implementation used throughout the renderer.  
It supports basic arithmetic, geometric operations, interpolation, projection, and helper utilities for graphics and physics calculations.

All vector operations modify the instance and return `this`, enabling method chaining.

---

## Class: Vector

### Constructor

#### `constructor(x = 0, y = 0)`
Creates a new vector with the given coordinates.

---

## Basic Setters and Copying

### `set(x, y)`
Sets both components of the vector.  
Returns the vector itself.

### `copy(v)`
Copies the values of another vector into this one.

### `clone()`
Returns a new `Vector` instance with the same coordinates.

---

## Arithmetic Operations

### `add(v)`
Adds another vector component-wise.

### `sub(v)`
Subtracts another vector component-wise.

### `scale(s)`
Scales both components by a scalar value `s`.

### `mul(v)`
Multiplies components by another vector component-wise.

### `div(s)`
Divides both components by a scalar.  
If `s` is zero, the vector becomes `(0, 0)`.

---

## Static Operations

### `Vector.dot(v1, v2)`
Returns the dot product of two vectors.

### `Vector.cross(v1, v2)`
Returns the 2D cross product (a scalar) of two vectors.

### `Vector.distance(v1, v2)`
Computes the Euclidean distance between two vectors.

---

## Length and Normalization

### `len()`
Returns the vector's magnitude.

### `lenSq()`
Returns the squared magnitude (avoids the cost of `sqrt`).

### `normalize()`
Normalizes the vector to unit length if its magnitude is non-zero.

---

## Projection

### `project(v)`
Projects the vector onto another vector `v`.  
If `v` has zero length, the vector becomes `(0, 0)`.

---

## Angles and Rotation

### `angle()`
Returns the angle of the vector in radians (`atan2(y, x)`).

### `rot(theta)`
Rotates the vector by the given angle in radians.

### `Vector.fromAngle(angle, length = 1)`
Creates a new vector pointing in the given direction with the given length.  
(Uses the renderer's coordinate convention.)

---

## Interpolation

### `lerp(v, t)`
Linearly interpolates toward vector `v` by factor `t` (0–1).

---

## Conversions

### `toString()`
Returns a formatted string:  
`Vector(x, y)`.

### `toArray()`
Returns a `Float32Array` containing `[x, y]`.
