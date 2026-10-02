"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;
const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  ({className, ...props}, ref) => <TabsPrimitive.List ref={ref} className={cn("inline-flex items-center justify-center", className)} {...props} />
);
TabsList.displayName = "TabsList";
const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  ({className, ...props}, ref) => <TabsPrimitive.Trigger ref={ref} className={cn("whitespace-nowrap outline-offset-2 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-50", className)} {...props} />
);
TabsTrigger.displayName = "TabsTrigger";
const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  ({className, ...props}, ref) => <TabsPrimitive.Content ref={ref} className={cn("mt-2 outline-offset-2", className)} {...props} />
);
TabsContent.displayName = "TabsContent";
export {Tabs, TabsList, TabsTrigger, TabsContent};
