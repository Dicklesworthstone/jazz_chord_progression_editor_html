import { createContext } from "preact";
import { useContext } from "preact/hooks";

export type FieldRelationship = Readonly<{
  controlId: string;
  descriptionIds: readonly string[];
  errorIds: readonly string[];
  fieldId: string;
  invalid: boolean;
  labelId: string;
  required: boolean;
}>;

export const FieldRelationshipContext =
  createContext<FieldRelationship | null>(null);

export function useFieldRelationship(): FieldRelationship | null {
  return useContext(FieldRelationshipContext);
}
