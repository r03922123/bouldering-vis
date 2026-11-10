import { cocoJobs } from './coco.mjs';

const coco = {
  images: [
    { id: 1, file_name: 'wall-a.jpg', width: 200, height: 100 },
    { id: 2, file_name: 'wall-b.jpg', width: 100, height: 100 },
  ],
  categories: [
    { id: 0, name: 'holds', supercategory: 'none' }, // Roboflow's parent category ("none" is a string)
    { id: 1, name: 'crimp', supercategory: 'holds' },
    { id: 2, name: 'jib', supercategory: 'holds' },
  ],
  annotations: [
    // A polygon: the tap goes at its centroid, not the bbox center.
    {
      id: 10,
      image_id: 1,
      category_id: 1,
      bbox: [10, 10, 40, 20],
      segmentation: [[10, 10, 50, 10, 50, 30, 10, 30]],
    },
    // Box only (no outline): the tap goes at the box center.
    { id: 11, image_id: 1, category_id: 2, bbox: [100, 50, 20, 20], segmentation: [] },
    { id: 12, image_id: 2, category_id: 0, bbox: [0, 0, 10, 10] },
  ],
};

describe('cocoJobs', () => {
  it('makes one job per photo with taps as fractions and labels from the category', () => {
    const jobs = cocoJobs(coco, 'beta-guide/train', 'train');
    expect(jobs).toHaveLength(1); // wall-b has only the parent category
    const [j] = jobs;
    expect(j!.photo).toBe('beta-guide/train/wall-a.jpg');
    expect(j!.split).toBe('train');
    expect(j!.taps).toEqual([
      { fx: 0.15, fy: 0.2, label: 'crimp' },
      { fx: 0.55, fy: 0.6, label: 'jib' },
    ]);
  });

  it('caps taps per class per photo, keeping the first ones', () => {
    const many = {
      ...coco,
      annotations: Array.from({ length: 5 }, (_, i) => ({
        id: i,
        image_id: 2,
        category_id: 1,
        bbox: [i * 10, 0, 10, 10],
      })),
    };
    expect(cocoJobs(many, 'x', 'train', 2)[0]!.taps).toHaveLength(2);
  });

  it('groups by photo so a photo never lands in two splits', () => {
    const [j] = cocoJobs(coco, 'x', 'valid');
    expect(j!.group).toBe('x/wall-a.jpg');
  });
});
