/** 既存の全画面Hand再推論列を比較する。原本を変更せず、公開出力には集計とハッシュだけを残す。 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const privateRoot = resolve(
  root,
  "work/private-artifacts/task-261008235701-recorded-motion-quality-baseline",
);
const output = resolve(
  root,
  "tasks/character-sincro-motion/task-261008235703-recorded-hand-orientation-study/artifacts/comparison-summary.json",
);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v) =>
  Math.hypot(...v) > 1e-8 ? v.map((x) => x / Math.hypot(...v)) : undefined;
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
const rms = (v) =>
  v.length ? Math.sqrt(v.reduce((n, x) => n + x * x, 0) / v.length) : null;
const range = (v) => (v.length ? Math.max(...v) - Math.min(...v) : null);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const point = (p) => [-p.x, -p.y, -p.z];

// 画像のzは幅と同じ尺度。ROIの位置・幅・高さを全画面へ戻してから等方的な画素単位へ変換する。
function imagePoint(
  p,
  width,
  height,
  roi = { x: 0, y: 0, width: 1, height: 1 },
) {
  return [
    -(roi.x + p.x * roi.width) * width,
    -(roi.y + p.y * roi.height) * height,
    -p.z * roi.width * width,
  ];
}
function palm(points, side) {
  const up = unit(sub(points[9], points[0]));
  if (!up) return undefined;
  const across = sub(points[5], points[17]).map(
    (x) => x * (side === "left" ? 1 : -1),
  );
  const right = unit(
    sub(
      across,
      up.map((x) => x * dot(across, up)),
    ),
  );
  if (!right) return undefined;
  return { right, up, normal: cross(right, up) };
}
// 関節点の方向差を足した1自由度の曲げ候補。位置や各関節のVRMボーン対応は変更しない。
function curl(points, indices) {
  const segments = indices
    .slice(1)
    .map((index, i) => unit(sub(points[index], points[indices[i]])));
  if (segments.some((v) => !v)) return undefined;
  return Math.min(
    1,
    segments.slice(1).reduce((sum, v, i) => sum + angle(segments[i], v), 0) /
      Math.PI,
  );
}
function twist(palmNormal, forearm, profile) {
  const axis = unit(forearm);
  if (!axis) return undefined;
  const project = (v) =>
    unit(
      sub(
        v,
        axis.map((x) => x * dot(v, axis)),
      ),
    );
  const reference = project([0, 0, 1]) ?? project([0, 1, 0]),
    desired = project(palmNormal);
  if (!reference || !desired) return undefined;
  const raw = Math.atan2(
    dot(axis, cross(reference, desired)),
    dot(reference, desired),
  );
  const limited =
    Math.max(-Math.PI / 2, Math.min(Math.PI / 2, raw)) *
    profile.wristRollInfluence;
  return {
    lower: limited * profile.lowerArmTwistShare,
    hand: limited * profile.handTwistShare,
  };
}

// 比率・ROI・左右・退化・前腕軸の不変条件。実写品質の代わりにはしない。
assert.deepEqual(
  imagePoint({ x: 0.5, y: 0.5, z: 0.1 }, 1280, 720),
  imagePoint({ x: 0.5, y: 0.5, z: 0.2 }, 1280, 720, {
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  }),
);
assert.deepEqual(
  imagePoint({ x: 0.5, y: 0.5, z: 0.1 }, 1280, 720),
  imagePoint({ x: 0.5, y: 1, z: 0.1 }, 1280, 360),
);
assert.equal(
  palm(
    Array.from({ length: 21 }, () => [0, 0, 0]),
    "left",
  ),
  undefined,
);
const testPoints = Array.from({ length: 21 }, () => [0, 0, 0]);
testPoints[9] = [0, 1, 0];
testPoints[5] = [1, 1, 0];
testPoints[17] = [-1, 1, 0];
const left = palm(testPoints, "left"),
  right = palm(
    testPoints.map((p) => [-p[0], p[1], p[2]]),
    "right",
  );
assert.ok(Math.hypot(...sub(left.normal, right.normal)) < 1e-12);
const shares = {
  wristRollInfluence: 1,
  lowerArmTwistShare: 0.65,
  handTwistShare: 0.35,
};
const known = twist([1, 0, 0], [0, 1, 0], shares);
assert.ok(Math.abs(known.lower + known.hand - Math.PI / 2) < 1e-12);
// 前腕自身の軸を回しても軸方向は不変なので、肩・肘・手首の到達位置を変えない。
const axis = [0, 1, 0],
  a = known.lower;
const rotated = axis.map(
  (v, i) =>
    v * Math.cos(a) +
    cross(axis, axis)[i] * Math.sin(a) +
    axis[i] * dot(axis, axis) * (1 - Math.cos(a)),
);
assert.deepEqual(rotated, axis);

const inventory = JSON.parse(
  readFileSync(
    resolve(
      root,
      "tasks/character-sincro-motion/task-261008235701-recorded-motion-quality-baseline/artifacts/recording-inventory.json",
    ),
    "utf8",
  ),
);
const results = [];
for (const fixture of ["hand-out-and-return", "fast-wave", "neutral-10s"]) {
  const filename = resolve(privateRoot, `hand-observations-${fixture}.json`),
    raw = readFileSync(filename);
  const data = JSON.parse(raw),
    recording = inventory.recordings.find((r) => r.fixture === fixture);
  const dimensions = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "json",
        resolve(root, recording.videoPath),
      ],
      { encoding: "utf8" },
    ),
  ).streams[0];
  const replay = readFileSync(resolve(root, recording.replayPath), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((r) => r.recordType === "frame");
  const baseline = JSON.parse(
    readFileSync(
      resolve(privateRoot, `filter-baseline-${fixture}.json`),
      "utf8",
    ),
  );
  const rows = { left: [], right: [] };
  let rejected = 0,
    ambiguous = 0;
  for (const observation of data.observations)
    for (const side of ["left", "right"]) {
      const hand = observation.hand[`${side}Hand`];
      if (
        !hand.detected ||
        hand.assignedSide !== side ||
        hand.confidence < 0.2 ||
        hand.warnings.length
      ) {
        rejected++;
        continue;
      }
      const indices = observation.raw.handednesses.flatMap((labels, i) =>
        labels[0]?.categoryName === hand.handednessLabel ? [i] : [],
      );
      if (indices.length !== 1) {
        ambiguous++;
        continue;
      }
      const index = indices[0],
        world = observation.raw.worldLandmarks[index]?.map(point),
        image = observation.raw.landmarks[index]?.map((p) =>
          imagePoint(p, dimensions.width, dimensions.height),
        );
      if (!world || !image) {
        rejected++;
        continue;
      }
      const basis = palm(world, side),
        imageBasis = palm(image, side);
      const frame = replay.find(
        (r) => r.frame.timestamp.mediaTimeMs === observation.mediaTimeMs,
      )?.frame;
      const pose = frame?.mediapipe?.pose?.worldLandmarks?.[0];
      if (!basis || !imageBasis || !pose) {
        rejected++;
        continue;
      }
      const elbow = side === "left" ? 13 : 14,
        wrist = side === "left" ? 15 : 16;
      const candidateTwist = twist(
        basis.normal,
        sub(point(pose[wrist]), point(pose[elbow])),
        baseline.profile.wrist,
      );
      const indexCurl = curl(world, [5, 6, 7, 8]);
      if (!candidateTwist || indexCurl === undefined) {
        rejected++;
        continue;
      }
      const saved = baseline.samples.find(
        (s) => s.mediaTimeMs === observation.mediaTimeMs,
      );
      rows[side].push({
        time: observation.mediaTimeMs,
        normal: basis.normal,
        indexCurl,
        currentCurl: hand.features.fingerCurl.index,
        lowerTwist: candidateTwist.lower,
        handTwist: candidateTwist.hand,
        currentWrist: saved.retarget[`${side}Arm`].wrist.z,
        basisDisagreement: angle(basis.normal, imageBasis.normal),
      });
    }
  const sides = Object.entries(rows).map(([side, values]) => {
    const steps = (key) =>
      values
        .slice(1)
        .flatMap((v, i) =>
          v.time - values[i].time <= 300 ? [v[key] - values[i][key]] : [],
        );
    return {
      side,
      validSamples: values.length,
      intervalsMs: values.slice(1).map((v, i) => v.time - values[i].time),
      currentCurlStepRms: rms(steps("currentCurl")),
      candidateCurlStepRms: rms(steps("indexCurl")),
      currentCurlRange: range(values.map((v) => v.currentCurl)),
      candidateCurlRange: range(values.map((v) => v.indexCurl)),
      currentWristStepRmsRad: rms(steps("currentWrist")),
      candidateLowerTwistStepRmsRad: rms(steps("lowerTwist")),
      candidateHandTwistStepRmsRad: rms(steps("handTwist")),
      imageWorldNormalDisagreementRmsRad: rms(
        values.map((v) => v.basisDisagreement),
      ),
    };
  });
  results.push({
    fixture,
    source: "保存済み全画面Handワールド座標・画像座標、Poseは前腕軸だけに使用",
    sha256: hash(raw),
    frames: data.observations.length,
    dimensions,
    rejected,
    ambiguous,
    sides,
  });
}
writeFileSync(
  output,
  JSON.stringify({ syntheticChecks: "PASS", results }, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    results.map((r) => ({
      fixture: r.fixture,
      rejected: r.rejected,
      sides: r.sides.map(({ intervalsMs, ...s }) => s),
    })),
    null,
    2,
  ),
);
