export type ModuleId = "code" | "asmr" | "video" | "image" | "music" | "agents";
export interface NoxiaModule { id: ModuleId; name: string; icon: string; description: string; href: string; status: "soon" | "live"; }
export interface NavItem { label: string; href: string; }
