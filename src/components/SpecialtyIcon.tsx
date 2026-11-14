import React from 'react';
import {
  Baby,
  Bone,
  Ear,
  HeartHandshake,
  HeartPulse,
  Smile,
  Sparkles,
  Stethoscope,
} from 'lucide-react';

export function SpecialtyIcon({
  iconKey,
  className = 'w-6 h-6',
}: {
  iconKey: string;
  className?: string;
}) {
  switch (iconKey) {
    case 'Baby':
      return <Baby className={className} aria-hidden="true" />;
    case 'Bone':
      return <Bone className={className} aria-hidden="true" />;
    case 'Sparkles':
      return <Sparkles className={className} aria-hidden="true" />;
    case 'HeartPulse':
      return <HeartPulse className={className} aria-hidden="true" />;
    case 'Ear':
      return <Ear className={className} aria-hidden="true" />;
    case 'HeartHandshake':
      return <HeartHandshake className={className} aria-hidden="true" />;
    case 'Smile':
      return <Smile className={className} aria-hidden="true" />;
    case 'Stethoscope':
    default:
      return <Stethoscope className={className} aria-hidden="true" />;
  }
}
