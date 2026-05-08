const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};
export async function postitems(request, env) {
  try {
    const formdata = await request.formData();

    const id = crypto.randomUUID();
    const name = formdata.get("name");
    const price = Number(formdata.get("price"));
    const quantity = Number(formdata.get("quantity") ?? 0);
    const image = formdata.get("image");

    if (!name || isNaN(price)) {
      return new Response(JSON.stringify({
        success: false,
        message: "Invalid input"
      }), { status: 400 });
    }

    let imageUrl = null;
    let date = new Date().toISOString();

    if (image && typeof image !== "string") {
      const imageKey = `images/${id}`;
      console.log("Uploading image to R2 with key:", env.friuts);
      await env.friuts.put(imageKey, image);
      imageUrl = `https://pub-c6af304c8e664fe5bcd74ee4f5adfb78.r2.dev/${imageKey}`;
    }
    const result = await env.DB.prepare(
      `INSERT INTO items (id, name, price, quantity, image, onupdate)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, name, price, quantity, imageUrl ?? "", date).run();

    return Response.json({ success: result.success });

  } catch (err) {
    return Response.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
}

export async function putitem(request, env) {
  try {
    const id = new URL(request.url).pathname.split("/")[2];

    const object = await env.DB.prepare(
      `SELECT * FROM items WHERE id = ?`
    ).bind(id).first();

    if (!object) {
      return new Response("Not found", { status: 404 });
    }

    const formdata = await request.formData();

    const name = formdata.get("name") as string | null;
    const priceValue = formdata.get("price");
    const quantityValue = formdata.get("quantity");
    const image = formdata.get("image") as File | null;

    let imageUrl = object.image;

    let date = new Date().toISOString();

    // Partial updates
    const updatedName = name ?? object.name;

    const updatedPrice =
      priceValue !== null ? Number(priceValue) : object.price;

    const updatedQuantity =
      quantityValue !== null ? Number(quantityValue) : object.quantity;

    // Image update only if new image uploaded
    if (image && image.size > 0) {

      // delete old image
      if (object.image) {
        const oldKey = object.image.split(".r2.dev/")[1];

        if (oldKey) {
          await env.friuts.delete(oldKey);
        }
      }

      const imageKey = `images/${id}-${image.name}`;

      await env.friuts.put(imageKey, image);

      imageUrl =
        `https://pub-c6af304c8e664fe5bcd74ee4f5adfb78.r2.dev/${imageKey}`;
    }

    const result = await env.DB.prepare(
      `UPDATE items
       SET name = ?, price = ?, quantity = ?, image = ?, onupdate = ?
       WHERE id = ?`
    )
      .bind(
        updatedName,
        updatedPrice,
        updatedQuantity,
        imageUrl,
        date,
        id
      )
      .run();

    return new Response(
      JSON.stringify({
        success: result.success,
      }),
      { headers }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
      }),
      { status: 500, headers }
    );
  }
}

export async function deleteitem(request, env) {
  try {
    const id = new URL(request.url).pathname.split("/")[2];

    const item = await env.DB.prepare(
      `SELECT image FROM items WHERE id = ?`
    ).bind(id).first();

    // Delete image from R2
    if (item?.image) {

      try {
        const url = new URL(item.image);

        // removes leading "/"
        const key = url.pathname.substring(1);

        console.log("Deleting key:", key);

        await env.friuts.delete(key);

      } catch (e) {
        console.log("Image delete failed:", e);
      }
    }

    // Delete DB row
    const result = await env.DB.prepare(
      `DELETE FROM items WHERE id = ?`
    ).bind(id).run();

    return new Response(
      JSON.stringify({
        success: result.success
      }),
      { headers }
    );

  } catch (err) {

    return new Response(
      JSON.stringify({
        success: false,
        error: err.message
      }),
      { status: 500, headers }
    );
  }
}

export async function getitems(request, env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM items ORDER BY id DESC`
    ).all();

    return new Response(JSON.stringify({
      success: true,
      items: results
    }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), { status: 500, headers });
  }
}