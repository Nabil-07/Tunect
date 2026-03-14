// =============================================
// File: src/components/SubjectsGrid.tsx
// Description: Grid of quick-select subjects
// =============================================
import React from 'react';
import { useNavigate } from 'react-router-dom';

/** Subjects that have dedicated SEO landing pages */
const LANDING_PAGE_MAP: Record<string, string> = {
  Mathematics: '/online-maths-tutor',
  Physics: '/online-physics-tutor',
  Chemistry: '/online-chemistry-tutor',
  Biology: '/online-biology-tutor',
  English: '/online-english-tutor',
};

const SubjectsGrid: React.FC<{ subjects: string[] }> = ({ subjects }) => {
  const nav = useNavigate();
  return (
    <div className="mt-6 flex flex-wrap gap-2" data-testid="subjects-grid">
      {subjects.map((s) => (
        <button
          key={s}
          onClick={() =>
            nav(LANDING_PAGE_MAP[s] ?? `/find-tutors?subject=${encodeURIComponent(s)}`)
          }
          className="px-3 py-1.5 rounded-xl text-sm bg-ocean-50 text-ocean-800 hover:bg-ocean-100 transition"
          data-testid={`subjects-grid-${s.toLowerCase().replace(/\s+/g, '-')}-btn`}
        >
          {s}
        </button>
      ))}
    </div>
  );
};

export default SubjectsGrid;

