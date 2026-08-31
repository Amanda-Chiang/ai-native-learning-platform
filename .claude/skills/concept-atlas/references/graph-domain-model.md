# Graph Domain Model (renderer-neutral)

The atlas renders a DTO shaped roughly like:

```ts
type ConceptAtlasDTO = {
  units: Unit[];
  concepts: Concept[];
  relationships: Relationship[];
};

type Unit = {
  id: string;
  title: string;
  conceptIds: string[];
};

type Concept = {
  id: string;
  canonicalLabel: string;
  aliases: string[];        // display/search only, never new concepts
  masteryState: MasteryState; // learner-specific, discrete
};

type Relationship = {
  id: string;
  type: RelationshipType;   // standardized, see relationship-taxonomy.md
  fromConceptId: string;
  toConceptId: string;
  crossUnit: boolean;
  learnerState: EdgeLearnerState;
};
```

No field in this DTO may contain renderer coordinates, React Flow node/edge
IDs, or ELK layout output. Those belong to a separate `LayoutState` produced
by the view adapter, keyed by concept/relationship id, and never written
back into the canonical DTO.
