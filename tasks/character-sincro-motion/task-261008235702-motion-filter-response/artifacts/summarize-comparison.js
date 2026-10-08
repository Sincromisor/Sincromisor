;async (page) =>
  page.evaluate(async () => {
    const { calculateFinalPoseMetrics } =
      await import("/character/motionEvaluation/motionFinalPoseMetrics.ts")
    const results = []
    for (const fixture of [
      "neutral-10s",
      "both-arms-slow-raise",
      "single-arm-slow-raise",
      "fast-wave",
      "arms-cross",
      "hand-out-and-return",
    ]) {
      const conditions = []
      for (const label of [
        "filter-baseline",
        "filter-input",
        "filter-minimal",
      ]) {
        const data = await (
          await fetch(`http://127.0.0.1:8878/${label}-${fixture}.json`)
        ).json()
        const times = data.samples.map((s) => s.mediaTimeMs),
          start = times[0] + 2000,
          end = times.at(-1),
          middle = (start + end) / 2
        const metrics = []
        for (const bone of [
          "leftUpperArm",
          "leftLowerArm",
          "rightUpperArm",
          "rightLowerArm",
        ]) {
          const side = bone.startsWith("left") ? "left" : "right"
          const samples = data.samples.map((s) => ({
            mediaTimeMs: s.mediaTimeMs,
            finalPose: s.finalPose.result?.finalPose ?? {},
            inputAngleRad: bone.includes("Upper")
              ? s.canonical.arms[side].elevationRad
              : s.canonical.arms[side].elbowFlexionRad,
            recovering: s.temporal.arms[side].state === "recovering",
          }))
          for (const [section, startMs, endMs] of [
            ["調整", start, middle],
            ["確認", middle, end],
          ])
            metrics.push({
              section,
              ...calculateFinalPoseMetrics(samples, {
                bone,
                startMs,
                endMs,
                maxLagMs: 600,
              }),
            })
        }
        conditions.push({
          label,
          config: data.config,
          frames: times.length,
          metrics,
          reachClampedFrames: data.samples.filter((s) =>
            [s.retarget.leftArm, s.retarget.rightArm].some(
              (a) => a.reach && a.reach.clampedBy !== "none",
            ),
          ).length,
          elbowFlipFrames: data.samples.filter((s) =>
            [s.retarget.leftArm, s.retarget.rightArm].some((a) =>
              a.constraint.reasonCodes?.includes("pole_flip_rejected"),
            ),
          ).length,
        })
      }
      results.push({ fixture, conditions })
    }
    await fetch("http://127.0.0.1:8877/filter-summary.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results),
    })
    return results.map((r) => ({
      fixture: r.fixture,
      conditions: r.conditions.map((c) => ({
        label: c.label,
        metrics: c.metrics
          .filter((m) => m.section === "確認" && m.bone === "leftUpperArm")
          .map((m) => ({
            rms: m.rotationStepRmsRad,
            amplitude: m.outputAmplitudeRad,
            lag: m.lag,
          })),
      })),
    }))
  })
