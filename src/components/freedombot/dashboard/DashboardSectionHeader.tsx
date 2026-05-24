interface DashboardSectionHeaderProps {
  title: string;
  description: string;
}

export function DashboardSectionHeader({ title, description }: DashboardSectionHeaderProps) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-black text-white">{title}</h2>
      <p className="text-xs mt-1 leading-relaxed max-w-2xl" style={{ color: "#64748b" }}>
        {description}
      </p>
    </div>
  );
}
