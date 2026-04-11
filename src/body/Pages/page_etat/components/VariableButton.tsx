import React from 'react';

interface VariableButtonProps {
  variablePath: string;
  label?: string;
  color: {
    bg: string;
    border: string;
    text: string;
    hoverBg: string;
    hoverText: string;
  };
  onClick: (variablePath: string) => void;
}

const VariableButton: React.FC<VariableButtonProps> = ({ variablePath, label, color, onClick }) => {
  return (
    <button
      onClick={() => onClick(variablePath)}
      style={{
        padding: '6px 8px',
        backgroundColor: color.bg,
        border: `1px solid ${color.border}`,
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '11px',
        textAlign: 'left',
        color: color.text,
        transition: 'all 0.2s',
        fontWeight: '500'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = color.hoverBg;
        e.currentTarget.style.color = color.hoverText;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = color.bg;
        e.currentTarget.style.color = color.text;
      }}
    >
      {`{{${variablePath}}}`}{label && ` - ${label}`}
    </button>
  );
};

export default VariableButton;

