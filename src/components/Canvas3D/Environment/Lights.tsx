import React from 'react';

export const Lights: React.FC<{ intensity: number }> = ({ intensity }) => {
  return (
    <>
      <ambientLight intensity={0.58 * intensity} />
      <directionalLight position={[0, 0, 1]} intensity={1.05 * intensity} />
      <directionalLight position={[0, 0, -1]} intensity={0.3 * intensity} />
    </>
  );
};
