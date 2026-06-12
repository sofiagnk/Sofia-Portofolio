export interface Metric {
  id: string;
  number: string;
  label: string;
  title: string;
  sub: string;
}

export interface ResearchInterest {
  id: string;
  num: string;
  name: string;
}

export interface LabExperience {
  id: string;
  period: string;
  name: string;
  institution: string;
  description: string;
  techniques: string[];
}

export interface Publication {
  id: string;
  journal: string;
  year: string;
  doi: string;
  title: string;
  abstract: string;
  detailAbstract?: string; // Larger text for reading drawer
  tags: string[];
  url: string;
}

export interface TimelineMilestone {
  id: string;
  year: string;
  title: string;
  description: string;
}

export interface SkillCategory {
  id: string;
  number: string;
  title: string;
  skills: string[];
}

export interface EducationItem {
  id: string;
  period: string;
  degree: string;
  institution: string;
  location: string;
  description?: string;
}

export interface ContactInfo {
  location: string;
  email: string;
  linkedin: string;
  linkedinUrl: string;
  orcid: string;
  orcidUrl: string;
}
