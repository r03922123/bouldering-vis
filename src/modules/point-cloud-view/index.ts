// Public API of the `point-cloud-view` module. See SPEC-point-cloud-view.md.
import { lazy } from 'react';

export {
  buildPointCloud,
  intrinsics,
  pickStride,
  recolor,
  reposition,
  unproject,
  type PointCloudData,
} from './build';
/** three.js and the 3D view load only when 3D view is first opened. */
export const PointCloudView = lazy(() => import('./PointCloudView'));
