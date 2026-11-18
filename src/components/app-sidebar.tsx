import { NavLink, useLocation } from "react-router-dom"
import { CreditCard, Gauge, Images, ListChecks, Plus, ScanLine, Settings2, Server, ShieldCheck } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useFamilies, useInfo, useRuns } from "@/api/hooks"
import { useConnection } from "@/api/client"
import { rgbHex } from "@/lib/color"
import { cn } from "@/lib/utils"

export function AppSidebar() {
  const { families } = useFamilies()
  const info = useInfo()
  const conn = useConnection()
  const queue = useRuns({ queue: true, limit: 1 }, { refetchInterval: 30_000 }).data?.review_queue ?? 0
  const loc = useLocation()
  const is = (p: string) => loc.pathname === p || (p !== "/" && loc.pathname.startsWith(p + "/"))

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <ShieldCheck className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Card Agent</span>
                  <span className="text-muted-foreground truncate text-xs">Validation console</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={is("/")} tooltip="Dashboard">
                <NavLink to="/"><Gauge /><span>Dashboard</span></NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={is("/validate")} tooltip="Validate a card">
                <NavLink to="/validate"><ScanLine /><span>Validate a card</span></NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={is("/runs")} tooltip="Runs & review">
                <NavLink to="/runs"><ListChecks /><span>Runs &amp; review</span></NavLink>
              </SidebarMenuButton>
              {queue > 0 && <SidebarMenuBadge className="bg-review/20 text-foreground" title="cases waiting for review">{queue}</SidebarMenuBadge>}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Card registry</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={loc.pathname === "/registry"} tooltip="Card families">
                <NavLink to="/registry"><CreditCard /><span>Card families</span></NavLink>
              </SidebarMenuButton>
              <SidebarMenuBadge>{families.length}</SidebarMenuBadge>
              <SidebarMenuSub>
                {families.map((f) => (
                  <SidebarMenuSubItem key={f.family}>
                    <SidebarMenuSubButton asChild isActive={is(`/registry/${f.family}`)}>
                      <NavLink to={`/registry/${f.family}`}>
                        <span className="flex -space-x-1">
                          {f.variants.slice(0, 4).map((v) => (
                            <span key={v.id} className="ring-sidebar size-2.5 rounded-full ring-1" style={{ background: rgbHex(v.body_color_rgb) }} />
                          ))}
                        </span>
                        <span>{f.family_name}</span>
                      </NavLink>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={is("/registry/new")}>
                    <NavLink to="/registry/new"><Plus /><span>Add card family</span></NavLink>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={is("/references")} tooltip="Reference cards">
                <NavLink to="/references"><Images /><span>Reference cards</span></NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={is("/settings")} tooltip="Settings">
                <NavLink to="/settings"><Settings2 /><span>Thresholds &amp; settings</span></NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavLink to="/settings" className="bg-sidebar-accent/60 hover:bg-sidebar-accent flex items-center gap-2 rounded-md p-2 text-xs group-data-[collapsible=icon]:hidden">
          <span className="relative">
            <Server className="text-muted-foreground size-4 shrink-0" />
            <span className={cn("ring-sidebar absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2", info.data ? "bg-accept" : info.isLoading ? "bg-muted-foreground" : "bg-reject")} />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-medium">{info.data ? "card-agent connected" : info.isLoading ? "connecting…" : "service offline"}</div>
            <div className="text-muted-foreground truncate font-mono">
              {info.data ? `registry ${info.data.registry_version} · ${info.data.auth.role}` : conn.baseUrl || "same origin"}
            </div>
          </div>
        </NavLink>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
