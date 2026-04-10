import React from 'react';

const ScoreBadge = ({ score, threshold }) => {
  const colorClass = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    gray: 'bg-gray-500',
  }[threshold.color] || 'bg-gray-500';

  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full text-white font-mono ${colorClass}`}>
      <span className="mr-2">{threshold.emoji}</span>
      <span>{score}</span>
      <span className="ml-2">{threshold.label}</span>
    </div>
  );
};

export default ScoreBadge;