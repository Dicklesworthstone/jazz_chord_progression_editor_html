#ifndef FRANKENJAZZ_DSP_H
#define FRANKENJAZZ_DSP_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

int32_t cg_note_frames(int32_t midi, float sample_rate);
int32_t cg_render(
    int32_t midi,
    int32_t velocity,
    float sample_rate,
    float *left,
    float *right,
    int32_t max_frames
);
int32_t cg_runtime_max_steps(int32_t output_capacity);
int32_t cg_runtime_init(
    int32_t midi,
    int32_t velocity,
    float sample_rate,
    int32_t max_frames
);
int32_t cg_runtime_step(
    int32_t handle,
    float *left,
    float *right,
    int32_t output_capacity
);
int32_t cg_runtime_written_frames(int32_t handle);
int32_t cg_runtime_reset(int32_t handle);

int32_t flt2_note_frames(int32_t midi, float sample_rate);
int32_t flt2_state_max_bytes(void);
int32_t flt2_render_phrase(
    int32_t midi,
    int32_t velocity,
    float sample_rate,
    uint32_t variation_slot,
    uint32_t articulation,
    float *left,
    float *right,
    int32_t max_frames,
    const uint8_t *state_input,
    int32_t state_input_bytes,
    uint8_t *state_output,
    int32_t state_output_capacity
);

int32_t clr_note_frames(int32_t midi, float sample_rate);
int32_t clr_render(
    int32_t midi,
    int32_t velocity,
    float sample_rate,
    float *left,
    float *right,
    int32_t max_frames
);

int32_t plk2_note_frames(int32_t pack_index, int32_t midi, float sample_rate);
int32_t plk2_render(
    int32_t pack_index,
    int32_t midi,
    int32_t velocity,
    float sample_rate,
    float *left,
    float *right,
    int32_t max_frames
);
int32_t plk2_render_chord(
    int32_t pack_index,
    const int32_t *midis,
    const int32_t *velocities,
    int32_t note_count,
    float sample_rate,
    float *left,
    float *right,
    int32_t max_frames
);
int32_t plk2_chord_runtime_max_steps(int32_t output_capacity);
int32_t plk2_chord_runtime_init(
    int32_t pack_index,
    const int32_t *midis,
    const int32_t *velocities,
    int32_t note_count,
    float sample_rate,
    int32_t max_frames
);
int32_t plk2_chord_runtime_step(
    int32_t handle,
    float *left,
    float *right,
    int32_t output_capacity
);
int32_t plk2_chord_runtime_cancel(int32_t handle);
int32_t plk2_chord_runtime_reset(int32_t handle);

#ifdef __cplusplus
}
#endif

#endif
