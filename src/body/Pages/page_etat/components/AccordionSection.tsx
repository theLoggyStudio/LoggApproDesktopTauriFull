import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface AccordionSectionProps {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  themeColor: {
    primary: string;
    secondary: string;
  };
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  icon,
  isOpen,
  onToggle,
  children,
  themeColor
}) => {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div 
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px',
          backgroundColor: themeColor.primary,
          color: themeColor.secondary,
          borderRadius: '5px',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {icon} {title}
        </h3>
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </div>
      
      {isOpen && (
        <div style={{ marginTop: '10px' }}>
          {children}
        </div>
      )}
    </div>
  );
};

export default AccordionSection;

