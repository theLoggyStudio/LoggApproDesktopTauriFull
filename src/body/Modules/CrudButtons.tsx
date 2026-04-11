import ButtonAjouter from "./ButtonAjouter";
import ButtonModifier from "./BouttonModifier";
import ButtonSupprimer from "./ButtonSupprimer";
import { useReadOnlyMode } from "../hooks/useReadOnlyMode";

export default function CrudButtons({ remove, update, create, removeVisibility = "block", updateVisibility = "block", createVisibility = "block" }) {
    const isReadOnly = useReadOnlyMode();
    
    // En mode lecture seule, désactiver les boutons de modification et suppression
    const finalRemoveVisibility = isReadOnly ? "none" : removeVisibility;
    const finalUpdateVisibility = isReadOnly ? "none" : updateVisibility;
    const finalCreateVisibility = isReadOnly ? "none" : createVisibility;

    return (
        <div className="row">
            <div className="col-xl-4"><ButtonAjouter onClick={create} visibility={finalCreateVisibility} /></div>
            <div className="col-xl-4"><ButtonModifier onClick={update} visibility={finalUpdateVisibility} /></div>
            <div className="col-xl-4"><ButtonSupprimer onClick={remove} visibility={finalRemoveVisibility} /></div>
        </div>
    );
}