import React from "react";

export default function ButtonPage({formeDuBoutton}) {
    return(
        <div className="row">
            <div className='col-md-4'><a className='btn color-violet w-5 border-2 px-5 border-warning text-warning' onClick={formeDuBoutton}>Ajouter</a></div>
        </div>
    );
}