import { useState } from "react";

export default function FactureDto() {
  const [factures, setFactures] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

  const findAll = async () => {
    const response = await fetch('https://api.elephantsql.com/api/factures');
    const data = await response.json();
    setFactures(data);
  }

  const findById = async (id) => {
    const response = await fetch(`https://api.elephantsql.com/api/factures/${id}`);
    const data = await response.json();
    return data;
  }

  const create = async (newFacture) => {
    await fetch('https://api.elephantsql.com/api/factures', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newFacture)
    });
  }

  const update = async (id, updatedFacture) => {
    await fetch(`https://api.elephantsql.com/api/factures/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updatedFacture)
    });
  }

  const remove = async (id) => {
    await fetch(`https://api.elephantsql.com/api/factures/${id}`, {
      method: 'DELETE'
    });
  }

  return { create, findAll, findById, update, remove };
}
