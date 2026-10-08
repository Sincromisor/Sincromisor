;async (page) =>
  page.evaluate(async () => {
    const { createSemanticFingerComposerLayers } =
      await import("/character/runtime/sincroVrmPoseComposerSemanticFingerLayers.ts")
    const { createDefaultMotionIntentState } =
      await import("/character/motionIntent/motionIntentState.ts")
    const results = []
    for (const fixture of ["hand-out-and-return", "fast-wave", "neutral-10s"]) {
      const data = await (
        await fetch(`http://127.0.0.1:8878/hand-observations-${fixture}.json`)
      ).json()
      const base = await (
        await fetch(`http://127.0.0.1:8878/filter-baseline-${fixture}.json`)
      ).json()
      let state = { previousFinger: {} },
        accepted = { left: 0, right: 0 },
        expired = 0
      for (const o of data.observations) {
        const result = createSemanticFingerComposerLayers(
          base.profile,
          {
            mode: "composer",
            mediaTimeMs: o.mediaTimeMs,
            hand: o.hand,
            intent: createDefaultMotionIntentState(o.mediaTimeMs),
          },
          state,
        )
        for (const side of ["left", "right"])
          if (
            result.previousFinger[side]?.observedAtMs !==
            state.previousFinger[side]?.observedAtMs
          )
            accepted[side]++
        state = { previousFinger: result.previousFinger }
        const late = createSemanticFingerComposerLayers(
          base.profile,
          {
            mode: "composer",
            mediaTimeMs: o.mediaTimeMs + 1000,
            intent: createDefaultMotionIntentState(o.mediaTimeMs),
          },
          state,
        )
        if (
          late.layers
            .filter((l) => l.id.startsWith("finger-curl"))
            .every((l) =>
              Object.values(l.pose).every(
                (q) => Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z) < 1e-9,
              ),
            )
        )
          expired++
      }
      results.push({
        fixture,
        frames: data.observations.length,
        accepted,
        expiredAfter1000Ms: expired,
      })
    }
    await fetch("http://127.0.0.1:8877/finger-expiry-summary.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results),
    })
    return results
  })
