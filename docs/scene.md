# Scene

The `Scene` manages a collection of nodes and provides fast collider lookup using a spatial hash grid.  
It is responsible only for node management, updates, and collider synchronization.

---

## Scene Responsibilities

- Store and manage `SceneNode` instances
- Maintain a spatial hash grid for colliders
- Update nodes (`update`, `fixedUpdate`)
- Synchronize collider world data

---

## Scene API

### addNode(node: SceneNode): SceneNode

Adds a node to the scene.

- Registers the node internally
- The node becomes part of scene updates

---

### `removeNode(node: SceneNode)`

Removes a node from the scene.

- Detaches the node from the scene
- Does not automatically destroy the node

---

### `findNode(name: string): SceneNode | null`

Returns the first node with the given name, or `null` if not found.

---

### `syncColliders()`

Synchronizes collider data.

- Updates world-space points of all colliders
- Rebuilds the spatial hash grid
- Must be called before rendering and before physics

---

### `update(dt: number)`

Calls `update(dt)` on all nodes in the scene.

---

### `fixedUpdate(dt: number)`

Calls `fixedUpdate(dt)` on all nodes in the scene.

---

# SceneNode

`SceneNode` is the base class for all nodes stored in a scene.  
Nodes use local transforms and can be parented to other nodes.

---

## SceneNode Properties

- `id` – unique node identifier
- `name` – optional node name
- `position` – local position
- `angle` – local rotation
- `parent` – parent node or `null`
- `worldPosition` – calculated world position
- `worldAngle` – calculated world rotation

Local transforms are always relative to the parent node.

---

## SceneNode Hierarchy

Nodes can form parent–child relationships.

- Child transforms are relative to the parent
- World transforms are calculated automatically
- Re-parenting supports preserving world position

---

## SceneNode API

### `setParent(newParent: SceneNode | null, worldPositionStays: boolean = true)`

Sets or removes the parent node.

- If `worldPositionStays` is `true`, the node keeps its world transform
- If `false`, the local transform is preserved

---

### `addNode(node: SceneNode): SceneNode`

Adds a node as a direct child of this node.

---

### `removeNode(node: SceneNode)`

Removes a direct child node.

---

### `getNodes(nodeClass?: Function): SceneNode[]`

Returns all descendant nodes.

- If `nodeClass` is provided, only nodes of that type are returned

---

### `getNodesFromParent(nodeClass?: Function): SceneNode[]`

Returns only direct child nodes.

- Optional filtering by node class

---

## Node Lifecycle Methods

Custom nodes can override the following methods:

- `start()` – called once when the node is added to a scene
- `update(dt)` – called every scene update
- `fixedUpdate(dt)` – called every scene fixed update
- `destroy()` – cleanup logic when the node is destroyed

---

## Node Messaging System

Nodes can communicate using a message-based system.

Messages are identified by string types and can carry arbitrary arguments.

---

### `emitMessage(type: string, ...args: any)`

Emits a message from the node.

---

### `addMessageHandler(type: string, handler: MessageHandler, options?: MessageHandlerOptions)`

Registers a handler for a message type.

### MessageHandlerOptions

- `once` – if `true`, the handler is removed after the first call

---

### `removeMessageHandler(type: string, handler: MessageHandler)`

Removes a previously registered message handler.
