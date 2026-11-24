import React from 'react';
import { IconLocation } from '../Icons';
import { geoStatusLabel, type GeoStatusKind } from '../../utils/checkinMessages';

export interface GeoStatusLineProps {
  kind: GeoStatusKind;
  accuracyMeters?: number;
}

export const GeoStatusLine: React.FC<GeoStatusLineProps> = ({ kind, accuracyMeters }) => {
  let modifier = 'is-idle';
  if (kind === 'measuring') modifier = 'is-measuring';
  else if (kind === 'ok') modifier = 'is-ok';
  else if (kind === 'ok_low') modifier = 'is-ok-low';
  else if (kind === 'bypass_measured' || kind === 'bypass_skipped') modifier = 'is-bypass';

  return (
    <div className={`ci-geo-status ${modifier}`} role="status">
      <IconLocation className="ci-geo-icon" size={16} />
      <span>{geoStatusLabel(kind, accuracyMeters)}</span>
    </div>
  );
};
