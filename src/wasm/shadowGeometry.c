#include <stdint.h>
#include <math.h>

typedef struct
{
    float x;
    float y;
} vec_t;

typedef struct
{
    vec_t worldPos;
    float radius;
} light_t;

static inline vec_t vec_add(vec_t v1, vec_t v2)
{
    vec_t out;
    out.x = v1.x + v2.x;
    out.y = v1.y + v2.y;
    return out;
}

static inline vec_t vec_sub(vec_t v1, vec_t v2)
{
    vec_t out;
    out.x = v1.x - v2.x;
    out.y = v1.y - v2.y;
    return out;
}

static inline vec_t vec_scale(vec_t v, float s)
{
    vec_t out;
    out.x = v.x * s;
    out.y = v.y * s;
    return out;
}

static inline float vec_len(vec_t v)
{
    return sqrtf(v.x * v.x + v.y * v.y);
}

static inline vec_t vec_normalize(vec_t v)
{
    float len = vec_len(v);
    if (len > 0.0f)
    {
        return vec_scale(v, 1.0f / len);
    }
    return (vec_t){0.0f, 0.0f};
}

static inline float vec_dot(vec_t v1, vec_t v2)
{
    return v1.x * v2.x + v1.y * v2.y;
}

__attribute__((export_name("createShadowsGeometry")))
uint32_t
createShadowsGeometry(
    uint32_t lightIdx,
    uint8_t *colliders,
    uint8_t *colliderIndices,
    uint32_t numColliderIndices,
    uint8_t *out)
{
    light_t light = *(light_t *)(lightIdx * 16);
    vec_t *outVertices = (vec_t *)out;
    uint32_t offset = 0;

    for (uint32_t i = 0; i < numColliderIndices; ++i)
    {
        uint32_t colliderIdx = *(uint32_t *)(colliderIndices + i * 4);
        uint8_t *collider = colliders + 68 * colliderIdx;

        uint32_t numPoints = *(uint32_t *)collider;
        vec_t *points = (vec_t *)(collider + 4);

        for (uint32_t j = 0; j < numPoints; ++j)
        {
            vec_t p0 = points[j];
            vec_t p1 = points[(j + 1) % numPoints];

            vec_t edgeCenter = vec_scale(vec_add(p0, p1), 0.5f);
            vec_t toLight = vec_sub(light.worldPos, edgeCenter);
            vec_t edgeDir = vec_sub(p1, p0);

            vec_t normal = {edgeDir.y, -edgeDir.x};

            float cosAngle = vec_dot(normal, vec_normalize(toLight));

            if (cosAngle <= 0.0f)
                continue;

            vec_t dir0 = vec_normalize(vec_sub(p0, light.worldPos));
            vec_t dir1 = vec_normalize(vec_sub(p1, light.worldPos));

            float dist = light.radius - vec_len(toLight);
            float shadowLength = (dist < light.radius * 0.01f ? light.radius * 0.01f : dist) * 100.0f;

            vec_t p2 = vec_add(p0, vec_scale(dir0, shadowLength));
            vec_t p3 = vec_add(p1, vec_scale(dir1, shadowLength));

            outVertices[offset++] = p0;
            outVertices[offset++] = p1;
            outVertices[offset++] = p2;
            outVertices[offset++] = p2;
            outVertices[offset++] = p1;
            outVertices[offset++] = p3;
        }
    }

    return offset;
}