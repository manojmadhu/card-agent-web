import { NavLink, useLocation } from "react-router-dom"
import { CreditCard, Gauge, Images, ListChecks, Plus, ScanLine, Settings2, Database, ShieldCheck } from "lucide-react"
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
import { useStore } from "@/store"
import { rgbHex } from "@/engine/vision"

export function AppSidebar() {
  const { families, runs, index, version, indexing, settings } = useStore()
  const loc = useLocation()
  const review = runs.filter((r) => r.result.status === "REVIEW").length
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
              {review > 0 && <SidebarMenuBadge className="bg-review/20 text-foreground">{review}</SidebarMenuBadge>}
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
                            <span key={v.id} className="ring-sidebar size-2.5 rounded-full ring-1" style={{ background: rgbHex(v.body_color_rgb as [number, number, number]) }} />
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
              <SidebarMenuBadge>{index.length}</SidebarMenuBadge>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={is("/settings")} tooltip="Thresholds & settings">
                <NavLink to="/settings"><Settings2 /><span>Thresholds &amp; settings</span></NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="bg-sidebar-accent/60 flex items-center gap-2 rounded-md p-2 text-xs group-data-[collapsible=icon]:hidden">
          <Database className="text-muted-foreground size-4 shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="font-mono truncate">{version}</div>
            <div className="text-muted-foreground truncate">
              {indexing ? "re-indexing…" : `${index.length} refs indexed`} · {settings.mode === "api" ? "API mode" : "browser engine"}
            </div>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
