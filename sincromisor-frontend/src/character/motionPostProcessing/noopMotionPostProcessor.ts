import {
    createNoopMotionPostProcessingResult,
    type MotionPostProcessingInput,
    type MotionPostProcessingResult,
} from "./motionPostProcessingState";

export interface MotionPostProcessor {
    process(input: MotionPostProcessingInput): MotionPostProcessingResult;
}

export class NoopMotionPostProcessor implements MotionPostProcessor {
    process(input: MotionPostProcessingInput): MotionPostProcessingResult {
        return createNoopMotionPostProcessingResult(input);
    }
}
