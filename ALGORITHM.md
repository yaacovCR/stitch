Basic Stitching Algorithm:

Execute Operation:

- Inline named fragments! This is done prior to coercing variables, so is done in a separate step. (should be done later? not at all?)
- Create a `RootPlan` with the transformed operation.
- Create a node to hold the result.
- For each `SubschemaPlan` in the `RootPlan`:
  - Send the initial set of operations.
  - As each operation result becomes available, compose them:
    - Create a `Stitch` with the help of the given `SubschemaPlan` and a pointer to the result node.
    - Stitch the `Stitch`.
- Return the node.

Creating a `RootPlan`:

- Coerce variables.
- Apply skip/include directives (may depends on variables).
- Collects root fields based on the appropriate root type.
- Create a `FieldPlan` for the given root fields (with no base schema, such that the `FieldTree` for the `FieldPlan` will be empty).
- Return the `FieldPlan`.

Creating a `FieldPlan`:

- Let `fromSubschema` be the given base schema.
- Create a data structure to hold the `FieldPlan` which will contain the `SubschemaPlan`s and the `FieldTree`.
- For each provided field, add the given field to the `FieldPlan` as follows:
  - Let `toSubschema` be the subschema from which this field should be retrieved.
  - Determine where in the data structure to add the field, creating a new `SubschemaPlan` entry for `toSubschema` as necessary.
  - If the field has no sub-selections, add the field to the appropriate `SubschemaPlan` and return.
  - Split the sub-selections in two, those that belong to `toSubschema`, and those that don't.
  - Add the field with the sub-selections that belong to `toSubschema` to the appropriate `SubschemaPlan`.
  - Create a `FieldPlanMap` using the sub-selections that do not belong to the subschema (with `toSubschema` as a base).
  - If `toSubschema` is the same as `fromSubschema`, add the `FieldPlanMap` to the `FieldPlan`'s `FieldTree` under the response key for the field.
  - Otherwise, add the `FieldPlanMap` to the appropriate `SubschemaPlan`'s `FieldTree` under the response key for the field.
- Return the `FieldPlan`.

Creating a `FieldPlanMap`:

- Let `fromSubschema` be the given base schema.
- Initialize a map of possible types to `FieldPlan`s.
- For each possible type of this field:
  - Collect the subfields from the sub-selections for the given type.
  - Create the `FieldPlan` for the given subfields using `fromSubschema`.
  - Within the map, set the entry for the given type to `FieldPlan`.
- Return the map.

Result Composition (Stitching the `Stitch`):

- If the data section of the result is null, null the pointer node and return.
- Copy the `data` from all the results under the pointer node.
- Create a map of subschemas to `Stitch`es.
- Walk the `FieldTree` for the given `SubschemaPlan` creating new `Stitch`es for each subschema, updating the pointer as necessary, saving the stitches in the map.
- Stitch the `Stitch`es.
