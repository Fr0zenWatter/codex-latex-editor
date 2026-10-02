import PillMorphTabs from "./ui/pill-morph-tabs";
export default function DemoOne() {
  return <PillMorphTabs defaultValue="overview" items={[
    {value:"overview",label:"Overview",panel:<div>Overview content</div>},
    {value:"features",label:"Features",panel:<div>Feature list</div>},
    {value:"pricing",label:"Pricing",panel:<div>Pricing &amp; plans</div>},
    {value:"faq",label:"FAQ",panel:<div>FAQ content</div>}
  ]} />;
}
