import { useReadOnlyMode } from "../hooks/useReadOnlyMode";

export default function ButtonSupprimer({onClick,visibility="block"}) {
    const isReadOnly = useReadOnlyMode();
    const finalVisibility = isReadOnly ? "none" : visibility;

    return(
        <div className="row mb-3 ">
            <center>
                <button type="submit" className='btn bouton-style w-5 border-2 px-5 border-danger text-danger' onClick={onClick} style={{display:finalVisibility}} disabled={isReadOnly}>Supprimer</button>
            </center>
        </div>
    );
}