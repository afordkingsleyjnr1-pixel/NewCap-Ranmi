"use client";

import { Suspense } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AccountSettingsTab } from "./_components/account-settings-tab";
import { MyAccountTab } from "./_components/my-account-tab";
import { TeamRolesTab } from "./_components/team-roles-tab";
import { TaxonomyTab } from "./_components/taxonomy-tab";
import { RecentlyDeletedTab } from "./_components/recently-deleted-tab";

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account Settings</TabsTrigger>
          <TabsTrigger value="my-account">My Account</TabsTrigger>
          <TabsTrigger value="team">Team & Roles</TabsTrigger>
          <TabsTrigger value="taxonomy">Taxonomy</TabsTrigger>
          <TabsTrigger value="deleted">Recently Deleted</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <AccountSettingsTab />
        </TabsContent>
        <TabsContent value="my-account">
          <Suspense>
            <MyAccountTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="team">
          <TeamRolesTab />
        </TabsContent>
        <TabsContent value="taxonomy">
          <TaxonomyTab />
        </TabsContent>
        <TabsContent value="deleted">
          <RecentlyDeletedTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
