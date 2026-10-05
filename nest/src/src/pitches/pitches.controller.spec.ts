import { describe, expect, it, vi } from 'vitest';

import { PitchesController } from './pitches.controller.js';
import { PitchesService } from './pitches.service.js';

describe('PitchesController', () => {
  it('chuyển id cho service', () => {
    const findOne = vi.fn().mockReturnValue('x');
    const controller = new PitchesController({
      findOne,
    } as unknown as PitchesService);

    controller.findOne(7);

    expect(findOne).toHaveBeenCalledWith(7);
  });
});
