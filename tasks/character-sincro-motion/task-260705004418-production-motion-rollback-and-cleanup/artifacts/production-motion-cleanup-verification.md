# Production Motion Cleanup Verification

## Scope

This artifact records attempt 2 verification for
`task-260705004418-production-motion-rollback-and-cleanup`.

Commit under verification:

- `4f30ea8377ba878cb75b6c2b1d0fd95a209c9d22`

Production code was not changed in attempt 2.

## Focused Harness Verification

Command:

```sh
cd /var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-c744785ac3b0-6ydeO2/sincromisor-frontend
npm run test -- src/character/motionEvaluation/__tests__/motionQaRegression.test.ts src/character/motionEvaluation/__tests__/motionComposerComparisonMetrics.test.ts src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts src/features/gaze/trackingRuntime/__tests__/trackerRuntimeDegradationPolicy.test.ts src/features/gaze/trackingRuntime/__tests__/trackerRuntime.test.ts src/character/vrmCharacter/__tests__/armBoneController.test.ts src/features/debug/model/__tests__/debugConsoleSincroMotionControls.test.ts
```

Result:

- PASS.
- 7 test files passed.
- 90 tests passed.

Coverage mapping:

| acceptance area                                     | evidence                                                                                                                                                                                                                                                                             | status                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| P0 fixture replay                                   | `motionQaRegression.test.ts` runs synthetic motion QA regression fixtures with matching baselines and verifies pass/warn/fail behavior for regression, missing source, old baseline missing metric, and subjective checklist handling.                                               | PASS as focused synthetic harness |
| composer metrics                                    | `motionComposerComparisonMetrics.test.ts` verifies retarget vs composer dry-run comparison, unavailable frames, status-bearing dry-run snapshots, legacy finalPose non-promotion, aggregation, missing frame severity, and not-captured baseline handling.                           | PASS                              |
| motion-debug replay / metrics / degradation display | `motionDebugViewerModel.test.ts` verifies motion-debug replay viewer layers, metrics layer behavior, QA regression API, optimization candidate API, degradation policy display, finalPose layer, and replay status handling.                                                         | PASS                              |
| camera degradation / recovery                       | `trackerRuntimeDegradationPolicy.test.ts` verifies fixed degradation order and reverse recovery, including face-only recovery gating on healthy pose. `trackerRuntime.test.ts` verifies runtime resumes Pose, Face ROI, and Hand after policy face-only / comfortable-idle recovery. | PASS                              |
| staged/full rollback config path                    | `debugConsoleSincroMotionControls.test.ts` verifies independent arm, torso / shoulder, semantic / finger, and full normalized pose mode config updates. `armBoneController.test.ts` verifies staged and full application rollback behavior.                                          | PASS                              |

## Browser Smoke Verification

Dev server:

```sh
cd /var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-c744785ac3b0-6ydeO2/sincromisor-frontend
npm run dev -- --host 127.0.0.1 --port 5177
```

### motion-debug default VRM

Commands:

```sh
playwright-cli open 'http://127.0.0.1:5177/motion-debug/?vrm=/characters/default.vrm'
playwright-cli --raw eval "JSON.stringify({title:document.title, url:location.href, canvasCount:document.querySelectorAll('canvas').length, hasMotionDebugApi:typeof window.__SINCRO_MOTION_DEBUG__ !== 'undefined', bodyText:document.body.innerText.slice(0,500)})"
playwright-cli console error
```

Observed:

- title: `Sincro Motion Debug`
- url: `http://127.0.0.1:5177/motion-debug/?vrm=/characters/default.vrm`
- canvasCount: `2`
- `window.__SINCRO_MOTION_DEBUG__`: installed
- console errors: `0`

### motion-debug aoi VRM

Commands:

```sh
playwright-cli goto 'http://127.0.0.1:5177/motion-debug/?vrm=/characters/aoi-1.0.7.vrm'
playwright-cli --raw eval "JSON.stringify({title:document.title, url:location.href, canvasCount:document.querySelectorAll('canvas').length, hasMotionDebugApi:typeof window.__SINCRO_MOTION_DEBUG__ !== 'undefined', apiKeys:window.__SINCRO_MOTION_DEBUG__?Object.keys(window.__SINCRO_MOTION_DEBUG__).sort():[], bodyText:document.body.innerText.slice(0,500)})"
playwright-cli console error
```

Observed:

- title: `Sincro Motion Debug`
- url: `http://127.0.0.1:5177/motion-debug/?vrm=/characters/aoi-1.0.7.vrm`
- canvasCount: `2`
- `window.__SINCRO_MOTION_DEBUG__`: installed
- API keys include `calculateReplayMetrics`, `getSnapshot`, `loadVideoFixture`, `runQaRegression`,
  `setRetargetConfig`, `startReplay`, `stepReplay`, `stopReplay`, and camera / recording helpers.
- console errors: `0`

### simple-vrm chat / sincro and rollback controls

Initial unmocked `/simple-vrm/` load showed the page and canvas but produced the expected local-dev backend absence
error for `/api/v1/RTCSignalingServer/config.json`. For UI smoke, the RTC config endpoint was mocked with the
contract-compatible payload:

```json
{
    "offerURL": "/api/v1/RTCSignalingServer/offer",
    "candidateURL": "/api/v1/RTCSignalingServer/candidate",
    "iceServers": []
}
```

Commands:

```sh
playwright-cli route '**/api/v1/RTCSignalingServer/config.json' --body='{"offerURL":"/api/v1/RTCSignalingServer/offer","candidateURL":"/api/v1/RTCSignalingServer/candidate","iceServers":[]}'
playwright-cli reload
playwright-cli --raw eval "JSON.stringify({title:document.title,url:location.href,canvasCount:document.querySelectorAll('canvas').length,bodyText:document.body.innerText.slice(0,800),talkModeSelect:[...document.querySelectorAll('select')].map(s=>({id:s.id,value:s.value,options:[...s.options].map(o=>o.text)})).find(x=>x.options.includes('chat')&&x.options.includes('sincro')),composerSelects:[...document.querySelectorAll('select')].filter(s=>s.id.startsWith('sincroPoseComposer')||s.id==='sincroPoseFullNormalizedApplication').map(s=>({id:s.id,value:s.value,options:[...s.options].map(o=>o.text)}))})"
playwright-cli console error
```

Observed:

- title: `Sincromisor(Simple)`
- canvasCount: `1`
- talk mode select present with `chat` and `sincro`
- rollback controls present:
    - `sincroPoseComposerArmApplication`
    - `sincroPoseComposerTorsoShoulder`
    - `sincroPoseComposerSemanticFinger`
    - `sincroPoseFullNormalizedApplication`
- console errors after RTC config mock: `0`

UI switch command:

```sh
playwright-cli --raw eval "JSON.stringify((()=>{const selects=[...document.querySelectorAll('select')]; const talk=selects.find(s=>[...s.options].some(o=>o.text==='chat')&&[...s.options].some(o=>o.text==='sincro')); if(talk){talk.value='sincro'; talk.dispatchEvent(new Event('change',{bubbles:true}));} const byId=id=>document.getElementById(id); const values={sincroPoseComposerArmApplication:'both',sincroPoseComposerTorsoShoulder:'composer',sincroPoseComposerSemanticFinger:'off',sincroPoseFullNormalizedApplication:'upper_body'}; for(const [id,value] of Object.entries(values)){const el=byId(id); if(el){el.value=value; el.dispatchEvent(new Event('change',{bubbles:true}));}} return {talkMode:talk?.value, composerSelects:Object.fromEntries(Object.keys(values).map(id=>[id,byId(id)?.value])), canvasCount:document.querySelectorAll('canvas').length};})())"
playwright-cli console error
```

Observed:

- `talkMode`: `sincro`
- rollback select values:
    - `sincroPoseComposerArmApplication`: `both`
    - `sincroPoseComposerTorsoShoulder`: `composer`
    - `sincroPoseComposerSemanticFinger`: `off`
    - `sincroPoseFullNormalizedApplication`: `upper_body`
- canvasCount: `1`
- console errors: `0`

## Camera Degradation / Recovery Boundary

実カメラ権限はこの browser smoke では使っていない。代替として、project-maintained focused tests の
`trackerRuntimeDegradationPolicy.test.ts` と `trackerRuntime.test.ts` を実行した。

確認した境界:

- degradation stage が固定順序で 1 段ずつ進む。
- recovery は逆順に進む。
- face-only recovery は healthy pose を要求する。
- policy face-only / comfortable-idle 後に Pose、Face ROI、Hand が再開する。

## Notes

- Browser smoke did not perform a live camera session.
- Browser smoke did not connect to a real backend RTC service; `/api/v1/RTCSignalingServer/config.json` was mocked only
  to prevent local-dev 404 from hiding UI / mode switch verification.
- motion-debug `setRetargetConfig()` API was installed and callable, but the browser snapshot did not reflect composer
  rollback flag changes on this page. The config update boundary is covered by `debugConsoleSincroMotionControls.test.ts`,
  and the visible `/simple-vrm/` controls were switched through DOM events.
