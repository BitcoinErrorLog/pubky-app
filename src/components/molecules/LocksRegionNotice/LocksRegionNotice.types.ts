export interface LocksRegionNoticeProps {
  /** `region`: the viewer's region is on the blocked list. `unknown`: it could not be read and unknown viewers are held. */
  cause?: 'region' | 'unknown';
  className?: string;
}
