import { TagApplication } from '@/application/tag/tag';
import type { TCreateTagResult } from '@/application/tag/tag.types';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';

export class TagController {
  private constructor() {}

  /**
   * Create a tag
   * @param params - Parameters object
   * @param params.targetId - ID of the post or user to tag
   * @param params.label - Tag label
   * @param params.taggerId - ID of the user adding the tag
   */
  static async commitCreate(params: TTagEventParams): Promise<TCreateTagResult | TCreateTagResult[] | undefined> {
    const tag = TagNormalizer.from(params);

    return TagApplication.commitCreate({ tagList: [tag] });
  }

  /**
   * Delete a tag
   * @param params - Parameters object
   * @param params.targetId - ID of the post or user
   * @param params.label - Tag label to remove
   * @param params.taggerId - ID of the user removing the tag
   */
  static async commitDelete(params: TTagEventParams) {
    const { tagUrl, label, taggerId, taggedId, taggedKind } = TagNormalizer.from(params);

    await TagApplication.commitDelete({
      taggedId,
      label,
      taggedKind,
      taggerId,
      tagUrl,
    });
  }

  static async materializeForDelete(params: TTagEventParams): Promise<void> {
    await TagApplication.materializeForDelete(params);
  }
}
