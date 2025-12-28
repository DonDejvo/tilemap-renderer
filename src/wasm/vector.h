#pragma once

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