// =============================================
// File: src/components/SubjectsGrid.tsx
// Description: Grid of quick-select subjects
// =============================================
import React from 'react';
import { useNavigate } from 'react-router-dom';

const SubjectsGrid: React.FC<{ subjects: string[] }> = ({ subjects }) => {
  const nav = useNavigate();
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {subjects.map((s) => (
        <button
          key={s}
          onClick={() => nav(`/find-tutors?subject=${encodeURIComponent(s)}`)}
          className="px-3 py-1.5 rounded-xl text-sm bg-ocean-50 text-ocean-800 hover:bg-ocean-100 transition"
        >
          {s}
        </button>
      ))}
    </div>
  );
};

export default SubjectsGrid;

