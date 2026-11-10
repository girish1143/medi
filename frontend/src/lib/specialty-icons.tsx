import {
  Activity,
  Baby,
  Bone,
  Brain,
  Eye,
  HeartPulse,
  Microscope,
  Smile,
  Sparkles,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  cardiology: HeartPulse,
  dermatology: Sparkles,
  neurology: Brain,
  pediatrics: Baby,
  orthopedics: Bone,
  gynecology: Activity,
  'general-medicine': Stethoscope,
  dentistry: Smile,
  ophthalmology: Eye,
  ent: Microscope,
  psychiatry: Brain,
  gastroenterology: Activity,
  endocrinology: Syringe,
};

export function specialtyIcon(slug: string): LucideIcon {
  return ICONS[slug] ?? Stethoscope;
}
