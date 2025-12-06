// src/components/PanelTitle.tsx

interface PanelTitleProps {
  icon?: React.ReactNode;
  title: string;
  right?: React.ReactNode;
}

export default function PanelTitle({ icon, title, right }: PanelTitleProps) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-200">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-slate-800 text-base">{title}</span>
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}
