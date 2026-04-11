import { useState } from "react";

export default function DocteurDto() {
  const [docteurs, setDocteurs] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

  const findAll = async () => {
    const response = await fetch('https://api.elephantsql.com/api/docteurs');
    const data = await response.json();
    setDocteurs(data);
  }

  const findById = async (id) => {
    const response = await fetch(`https://api.elephantsql.com/api/docteurs/${id}`);
    const data = await response.json();
    return data;
  }

  const create = async (newDocteur) => {
    await fetch('https://api.elephantsql.com/api/docteurs', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newDocteur)
    });
  }

  const update = async (id, updatedDocteur) => {
    await fetch(`https://api.elephantsql.com/api/docteurs/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updatedDocteur)
    });
  }

  const remove = async (id) => {
    await fetch(`https://api.elephantsql.com/api/docteurs/${id}`, {
      method: 'DELETE'
    });
  }

  return { create, findAll, findById, update, remove };
}
