import React, { useState } from 'react';

export default function ActeDto() {
    const [actes, setActes] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

    const findAll = async () => {
        const response = await fetch('https://api.elephantsql.com/api/actes',fetchOptions);
        const data = await response.json();
        setActes(data);
        return actes
    }

    const findById = async (id) => {
        const response = await fetch(`https://api.elephantsql.com/api/actes/${id}`,fetchOptions);
        const data = await response.json();
        return data;
    }

    const create = async (newActe) => {
        await fetch('https://api.elephantsql.com/api/actes', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newActe)
        });
    }

    const update = async (id, updatedActe) => {
        await fetch(`https://api.elephantsql.com/api/actes/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(updatedActe)
        },);
    }

    const remove = async (id) => {
        await fetch(`https://api.elephantsql.com/api/actes/${id}`, {
            method: 'DELETE'
        });
    }

    return { create, findAll, findById, update, remove };
}
