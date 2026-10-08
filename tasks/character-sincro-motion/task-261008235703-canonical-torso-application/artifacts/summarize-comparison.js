;async (page) =>
  page.evaluate(async () => {
    const results = []
    for (const fixture of [
      "neutral-10s",
      "both-arms-slow-raise",
      "single-arm-slow-raise",
      "fast-wave",
      "arms-cross",
      "hand-out-and-return",
    ]) {
      const data = await (
        await fetch(`http://127.0.0.1:8878/motion-final-${fixture}.json`)
      ).json()
      const torso = data.samples
        .map((s) => s.retarget.upperBody.torsoQuaternion)
        .filter(Boolean)
      const angles = torso.map((q) => 2 * Math.acos(Math.min(1, Math.abs(q.w))))
      results.push({
        fixture,
        frames: data.samples.length,
        torsoRotationMaxRad: Math.max(...angles),
        torsoRotations: torso.length,
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
        semanticSuppressed: data.samples.reduce(
          (n, s) =>
            n +
            s.finalPose.result.suppressedLayers.filter(
              (l) => l.reason === "semantic_conflict",
            ).length,
          0,
        ),
      })
    }
    const handResults = []
    for (const fixture of ["neutral-10s", "fast-wave", "hand-out-and-return"]) {
      const data = await (
        await fetch(`http://127.0.0.1:8878/motion-final-hands-${fixture}.json`)
      ).json()
      handResults.push({
        fixture,
        frames: data.samples.length,
        semanticSuppressed: data.samples.reduce(
          (n, s) =>
            n +
            s.finalPose.result.suppressedLayers.filter(
              (l) => l.reason === "semantic_conflict",
            ).length,
          0,
        ),
        ownedFingerFrames: data.samples.filter((s) =>
          s.finalPose.result.ownedBones.includes("leftIndexProximal"),
        ).length,
      })
    }
    await fetch("http://127.0.0.1:8877/motion-final-summary.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results, handResults }),
    })
    return { results, handResults }
  })
